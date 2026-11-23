import { X } from "@lyra/icons";
import {
  APP_TAB_CLOSE_CLASS,
  APP_TAB_ITEM_CLASS,
  APP_TAB_MAIN_CLASS,
  APP_TAB_TITLE_CLASS,
  AppIconButton,
  Tabs,
  TabsList,
  TabsTrigger
} from "@renderer/ui/components";
import { cn } from "@renderer/ui/utils";
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

const EDITOR_TAB_TRIGGER_CLASS = cn(
  "h-full w-full min-w-0 flex-none justify-start px-3 py-0 text-inherit",
  "hover:bg-accent hover:text-accent-foreground",
  "data-[state=active]:bg-transparent data-[state=active]:text-inherit",
  "group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-0",
  APP_TAB_MAIN_CLASS,
  APP_TAB_TITLE_CLASS,
  TREE_EDITOR_TAB_MAIN_CLASS
);

const EDITOR_TABS_LIST_CLASS = cn(
  "lyra-tab-strip",
  TREE_EDITOR_TABS_CLASS,
  "flex w-full min-w-0 flex-1 items-stretch justify-start gap-0 rounded-none p-0 text-inherit",
  "group-data-[orientation=horizontal]/tabs:h-[var(--lyra-tab-control-h)]!"
);

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
    <Tabs
      className="contents"
      value={activeEditorInstanceId ?? ""}
      onValueChange={(value) => {
        onActivate(value);
      }}
    >
      <TabsList
        variant="line"
        className={EDITOR_TABS_LIST_CLASS}
        aria-label={t("agentProjectTree.editorTabs")}
      >
        {tabs.map((tab) => {
          const active = tab.editorInstanceId === activeEditorInstanceId;
          const title = titleFromPath(tab.filePath);
          return (
            <div
              key={tab.editorInstanceId}
              className={[
                APP_TAB_ITEM_CLASS,
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
              <TabsTrigger
                className={EDITOR_TAB_TRIGGER_CLASS}
                value={tab.editorInstanceId}
                title={tab.filePath}
              >
                {title}
              </TabsTrigger>
              <AppIconButton
                className={`${APP_TAB_CLOSE_CLASS} lyra-agent-project-tree-editor-tab-close`}
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
      </TabsList>
    </Tabs>
  );
};
