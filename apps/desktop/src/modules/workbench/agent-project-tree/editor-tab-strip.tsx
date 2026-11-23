import { X } from "@lyra/icons";
import { AppButton, AppIconButton } from "@renderer/ui/components";
import { t } from "@workbench/i18n";

import {
  handleChromeTabCloseClick,
  handleChromeTabClosePointerDown,
  isChromeTabCloseTarget,
  isMiddleClick,
  type ChromeTabCloseGestureEvent
} from "../ui-primitives";
import type { AgentProjectTreeEditorTab } from "./open-editor-tab";
import { TREE_EDITOR_TAB_CLASS, TREE_EDITOR_TAB_MAIN_CLASS, TREE_EDITOR_TAB_PREVIEW_CLASS, TREE_EDITOR_TABS_CLASS } from "./classes";

const titleFromPath = (filePath: string): string => {
  const normalized = filePath.replaceAll("\\", "/");
  const segments = normalized.split("/");
  const tail = segments[segments.length - 1];
  return tail === undefined || tail.length === 0 ? filePath : tail;
};

export const AgentProjectTreeEditorTabStrip = ({
  tabs,
  activeEditorInstanceId,
  onActivate,
  onClose,
  onPin
}: {
  readonly tabs: readonly AgentProjectTreeEditorTab[];
  readonly activeEditorInstanceId: string | null;
  readonly onActivate: (editorInstanceId: string) => void;
  readonly onClose: (editorInstanceId: string, event: ChromeTabCloseGestureEvent) => void;
  readonly onPin: (editorInstanceId: string) => void;
}) => {
  if (tabs.length === 0) {
    return null;
  }
  return (
    <div
      className={`lyra-tab-strip ${TREE_EDITOR_TABS_CLASS}`}
      role="tablist"
      aria-label={t("agentProjectTree.editorTabs")}
    >
      {tabs.map((tab) => {
        const active = tab.editorInstanceId === activeEditorInstanceId;
        const title = titleFromPath(tab.filePath);
        return (
          <div
            key={tab.editorInstanceId}
            className={[
              "lyra-tab-item",
              TREE_EDITOR_TAB_CLASS,
              active ? "lyra-tab-item-active" : "",
              tab.preview ? TREE_EDITOR_TAB_PREVIEW_CLASS : ""
            ].filter((value) => value.length > 0).join(" ")}
            data-lyra-tab-id={tab.editorInstanceId}
            onMouseDown={(event) => {
              if (isMiddleClick(event)) {
                event.preventDefault();
                onClose(tab.editorInstanceId, event);
              }
            }}
            onAuxClick={(event) => {
              if (isMiddleClick(event)) {
                event.preventDefault();
                onClose(tab.editorInstanceId, event);
              }
            }}
            onDoubleClick={() => {
              onPin(tab.editorInstanceId);
            }}
          >
            <AppButton
              className={`lyra-tab-main lyra-tab-title ${TREE_EDITOR_TAB_MAIN_CLASS}`}
              variant="ghost"
              size="sm"
              role="tab"
              aria-selected={active}
              title={tab.filePath}
              onClick={() => {
                onActivate(tab.editorInstanceId);
              }}
            >
              {title}
            </AppButton>
            <AppIconButton
              className="lyra-tab-close lyra-agent-project-tree-editor-tab-close"
              aria-label={t("agentProjectTree.closeEditorTab")}
              onPointerDown={(event) => {
                handleChromeTabClosePointerDown(event, (closeEvent) => {
                  onClose(tab.editorInstanceId, closeEvent);
                });
              }}
              onClick={(event) => {
                if (isChromeTabCloseTarget(event.target) === false) {
                  return;
                }
                handleChromeTabCloseClick(event, (closeEvent) => {
                  onClose(tab.editorInstanceId, closeEvent);
                });
              }}
            >
              <X size={12} />
            </AppIconButton>
          </div>
        );
      })}
    </div>
  );
};
