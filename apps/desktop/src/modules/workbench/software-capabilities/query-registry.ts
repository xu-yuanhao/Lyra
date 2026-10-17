import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import type {
  LyraSoftwareActionHandler,
  LyraSoftwareActionManifest,
  LyraSoftwareCapabilitiesContext,
  LyraSoftwareManifest,
  SoftwareCapabilitiesQueryRequest,
  SoftwareCapabilitiesQueryResult,
  SoftwareInspectCapabilityRequest,
  SoftwareInspectCapabilityResponse,
  SoftwareInvokeCapabilityRequest,
  SoftwareInvokeCapabilityResponse,
  SoftwareListCapabilitiesResponse,
  SoftwareReadStateRequest,
  SoftwareReadStateResponse
} from "../../../shared/desktop-bridge";
import {
  softwareWithoutSchemas
} from "./manifest";
import {
  toRecord,
  validateInputSchema
} from "./validation";

type ExternalHandlerRegistration = {
  readonly packId: string;
  readonly softwareId: string;
  readonly actionId: string;
  readonly handler: LyraSoftwareActionHandler;
};

export const findSoftware = (
  software: readonly LyraSoftwareManifest[],
  softwareId: unknown
): LyraSoftwareManifest => {
  // Validation errors must name the offending parameter and the accepted
  // values; a bare "undefined" leak tells the model nothing actionable.
  if (typeof softwareId !== "string" || softwareId.trim().length === 0) {
    throw new Error(
      `softwareId is required and must be a non-empty string. Valid software ids: ${
        software.map((item) => item.id).join(", ") || "(none registered)"
      }`
    );
  }
  const entry = software.find((item) => item.id === softwareId);
  if (entry === undefined) {
    throw new Error(
      `Unknown software id "${softwareId}". Valid software ids: ${
        software.map((item) => item.id).join(", ") || "(none registered)"
      }`
    );
  }
  return entry;
};

export const findAction = (
  software: LyraSoftwareManifest,
  actionId: unknown
): LyraSoftwareActionManifest => {
  if (typeof actionId !== "string" || actionId.trim().length === 0) {
    throw new Error(
      `actionId is required and must be a non-empty string. Valid action ids for ${software.id}: ${
        software.actions.map((item) => item.id).join(", ") || "(none)"
      }`
    );
  }
  const action = software.actions.find((item) => item.id === actionId);
  if (action === undefined) {
    throw new Error(
      `Unknown action "${actionId}" for ${software.id}. Valid action ids: ${
        software.actions.map((item) => item.id).join(", ") || "(none)"
      }`
    );
  }
  return action;
};

export const createSuccessResult = (
  requestId: string,
  result:
    | SoftwareListCapabilitiesResponse
    | SoftwareInspectCapabilityResponse
    | SoftwareReadStateResponse
    | SoftwareInvokeCapabilityResponse
): SoftwareCapabilitiesQueryResult => ({
  requestId,
  ok: true,
  result
});

export const createErrorResult = (
  requestId: string,
  error: unknown
): SoftwareCapabilitiesQueryResult => ({
  requestId,
  ok: false,
  error: {
    code: "software_capability_failed",
    message: error instanceof Error ? error.message : String(error)
  }
});

export const useSoftwareCapabilitiesQueryRegistry = ({
  activeUiPackId,
  software,
  builtinHandlers,
  readSoftwareState
}: {
  readonly activeUiPackId: string;
  readonly software: readonly LyraSoftwareManifest[];
  readonly builtinHandlers: ReadonlyMap<string, LyraSoftwareActionHandler>;
  readonly readSoftwareState: (request?: SoftwareReadStateRequest) => SoftwareReadStateResponse;
}) => {
  const [handlerRevision, setHandlerRevision] = useState(0);
  const externalHandlersRef = useRef(new Map<string, ExternalHandlerRegistration>());

  const invoke = useCallback(async (
    request: SoftwareInvokeCapabilityRequest
  ): Promise<unknown> => {
    const selectedSoftware = findSoftware(software, request.softwareId);
    const action = findAction(selectedSoftware, request.actionId);
    const builtinHandler = builtinHandlers.get(action.id);
    const externalHandler = externalHandlersRef.current.get(action.id);
    const handler = builtinHandler ?? externalHandler?.handler;
    if (handler === undefined) {
      throw new Error(`No registered handler for ${action.id}`);
    }
    const requestRecord = toRecord(request);
    const handlerInput = requestRecord.permissionGranted === true
      ? {
          ...toRecord(request.input),
          permissionGranted: true
        }
      : request.input;
    const validationErrors = validateInputSchema(handlerInput, action.inputSchema);
    if (validationErrors.length > 0) {
      throw new Error(`Invalid input for ${action.id}: ${validationErrors.join("; ")}`);
    }
    return await handler(handlerInput, {
      softwareId: selectedSoftware.id,
      actionId: action.id,
      ...(request.reason === undefined ? {} : { reason: request.reason })
    });
  }, [builtinHandlers, handlerRevision, software]);

  const inspect = useCallback((request: SoftwareInspectCapabilityRequest) => {
    const selectedSoftware = findSoftware(software, request.softwareId);
    const requestedActionId = request.actionId ?? request.capabilityId;
    const action = requestedActionId === undefined
      ? undefined
      : findAction(selectedSoftware, requestedActionId);
    const actionIds = action === undefined
      ? selectedSoftware.actions.map((item) => item.id)
      : [action.id];
    return {
      software: selectedSoftware,
      ...(action === undefined ? {} : { action }),
      handlerRegistered: actionIds.every((actionId) =>
        builtinHandlers.has(actionId) || externalHandlersRef.current.has(actionId)
      ),
      readableState: readSoftwareState({ softwareId: selectedSoftware.id }).state
    };
  }, [builtinHandlers, handlerRevision, readSoftwareState, software]);

  const handleBridgeQuery = useCallback(async (
    request: SoftwareCapabilitiesQueryRequest
  ): Promise<SoftwareCapabilitiesQueryResult> => {
    try {
      if (request.method === "software.listCapabilities") {
        return createSuccessResult(request.requestId, {
          software: request.payload.includeSchemas === true
            ? software
            : softwareWithoutSchemas(software)
        });
      }
      if (request.method === "software.inspectCapability") {
        return createSuccessResult(request.requestId, inspect(request.payload));
      }
      if (request.method === "software.readState") {
        return createSuccessResult(request.requestId, readSoftwareState(request.payload));
      }
      const output = await invoke(request.payload);
      return createSuccessResult(request.requestId, {
        softwareId: request.payload.softwareId,
        actionId: request.payload.actionId,
        ...(output === undefined ? {} : { output })
      });
    } catch (queryError: unknown) {
      return createErrorResult(request.requestId, queryError);
    }
  }, [inspect, invoke, readSoftwareState, software]);

  const createUiPackCapabilities = useCallback((
    packId: string,
    declaredSoftware: readonly LyraSoftwareManifest[]
  ): LyraSoftwareCapabilitiesContext => {
    const declaredActions = new Map<string, string>();
    for (const softwareEntry of declaredSoftware) {
      for (const action of softwareEntry.actions) {
        declaredActions.set(action.id, softwareEntry.id);
      }
    }
    return {
      software: declaredSoftware,
      registerActionHandler: (actionId, handler) => {
        const normalizedActionId = actionId.trim();
        const softwareId = declaredActions.get(normalizedActionId);
        if (softwareId === undefined) {
          throw new Error(`Action is not declared by ${packId}: ${normalizedActionId}`);
        }
        const registration: ExternalHandlerRegistration = {
          packId,
          softwareId,
          actionId: normalizedActionId,
          handler
        };
        externalHandlersRef.current.set(normalizedActionId, registration);
        setHandlerRevision((current) => current + 1);
        return () => {
          if (externalHandlersRef.current.get(normalizedActionId) === registration) {
            externalHandlersRef.current.delete(normalizedActionId);
            setHandlerRevision((current) => current + 1);
          }
        };
      }
    };
  }, []);

  useEffect(() => {
    const declaredActionIds = new Set(software.flatMap((entry) =>
      entry.actions.map((action) => action.id)
    ));
    let changed = false;
    for (const [actionId] of externalHandlersRef.current) {
      if (declaredActionIds.has(actionId) === false) {
        externalHandlersRef.current.delete(actionId);
        changed = true;
      }
    }
    if (changed) {
      setHandlerRevision((current) => current + 1);
    }
  }, [software]);

  useEffect(() => {
    let changed = false;
    for (const [actionId, registration] of externalHandlersRef.current) {
      if (registration.packId !== activeUiPackId) {
        externalHandlersRef.current.delete(actionId);
        changed = true;
      }
    }
    if (changed) {
      setHandlerRevision((current) => current + 1);
    }
  }, [activeUiPackId]);

  return {
    handlerRevision,
    handleBridgeQuery,
    createUiPackCapabilities
  };
};
