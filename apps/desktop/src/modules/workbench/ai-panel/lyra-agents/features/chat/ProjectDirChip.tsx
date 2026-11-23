import { useProjects } from "../../../../settings-projects";
import { ChevronDown, Folder } from "@lyra/icons";
import { useEffect, useState } from "react";
import {
  AppButton,
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuSeparator,
  AppMenuSub,
  AppMenuSubContent,
  AppMenuSubTrigger,
  AppMenuTrigger,
  reportWorkbenchError
} from "@renderer/ui/components";
import { LyraLogo } from "@renderer/ui/app";
import type { DetectedEditor, LyraDesktopApi } from "../../../../../../shared/desktop-bridge";
import { IdentityIconView, useSessionIdentityIcon } from "../../../../identity";
import { formatMessage, t } from "@workbench/i18n";
import {
  EDITOR_MENU_ICON_CLASS,
  EDITOR_MENU_ROW_CLASS,
  PROJECT_DIR_CHIP_CHEVRON_CLASS,
  PROJECT_DIR_CHIP_CLASS,
  PROJECT_DIR_CHIP_ICON_CLASS,
  PROJECT_DIR_CHIP_IMAGE_CLASS,
  PROJECT_DIR_CHIP_LABEL_CLASS,
  PROJECT_DIR_CHIP_LYRA_LOGO_CLASS
} from "./classes";

const ICON_SIZE = 13;
const ICON_STROKE_WIDTH = 2;

export function ProjectDirChip({
  desktopApi,
  projectName,
  workingDir,
  isHome,
  canOpenProjectTree,
  onChooseProject,
  onSelectProject,
  onOpenProjectTree,
  onOpenInFileManager,
}: {
  desktopApi?: LyraDesktopApi | null;
  sessionId?: string | null | undefined;
  projectName: string | null;
  workingDir: string | null;
  isHome: boolean;
  canOpenProjectTree: boolean;
  onChooseProject: () => Promise<void> | void;
  onSelectProject?: (path: string) => Promise<void> | void;
  onOpenProjectTree: () => Promise<void> | void;
  onOpenInFileManager: (path: string) => Promise<void> | void;
}) {
  const icon = useSessionIdentityIcon(desktopApi ?? null, workingDir);
  const label = isHome || projectName === null || projectName.trim().length === 0
    ? t("lyra-agents-composer.workingDirHome")
    : projectName.trim();
  const [editors, setEditors] = useState<DetectedEditor[]>([]);
  const { projects: knownProjects } = useProjects(desktopApi ?? null);
  const [chooseOpen, setChooseOpen] = useState(false);

  useEffect(() => {
    if (!canOpenProjectTree || !desktopApi?.detectEditors) return;
    void desktopApi.detectEditors().then(setEditors).catch(() => undefined);
  }, [canOpenProjectTree, desktopApi]);

  const chipContent = (
    <>
      <IdentityIconView
        className={PROJECT_DIR_CHIP_ICON_CLASS}
        imageClassName={PROJECT_DIR_CHIP_IMAGE_CLASS}
        iconUrl={icon.url}
        label={icon.label}
        fallback={
          icon.renderHint === "lyra-logo"
            ? <LyraLogo className={PROJECT_DIR_CHIP_LYRA_LOGO_CLASS} alt="" />
            : <Folder size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
        }
      />
      <span className={PROJECT_DIR_CHIP_LABEL_CLASS}>{label}</span>
      <ChevronDown size={12} strokeWidth={1.8} className={PROJECT_DIR_CHIP_CHEVRON_CLASS} aria-hidden="true" />
    </>
  );

  const chipTrigger = (
    <AppButton
      variant="ghost"
      size="sm"
      type="button"
      className={PROJECT_DIR_CHIP_CLASS}
      aria-label={label}
      title={
        canOpenProjectTree
          ? t("header.openProjectTree")
          : knownProjects.length > 0
            ? t("lyra-agents-composer.chooseProject")
            : t("lyra-agents-composer.newProject")
      }
    >
      {chipContent}
    </AppButton>
  );

  if (!canOpenProjectTree) {
    return (
      <AppMenu
        onOpenChange={(open) => {
          if (!open) {
            setChooseOpen(false);
          }
        }}
      >
        <AppMenuTrigger asChild>
          {chipTrigger}
        </AppMenuTrigger>
        <AppMenuContent align="start" sideOffset={4}>
          {knownProjects.length > 0 ? (
            <AppMenuSub
              open={chooseOpen}
              onOpenChange={setChooseOpen}
            >
              <AppMenuSubTrigger
                onFocus={() => setChooseOpen(true)}
                onMouseEnter={() => setChooseOpen(true)}
                onPointerMove={() => setChooseOpen(true)}
              >
                {t("lyra-agents-composer.chooseProject")}
              </AppMenuSubTrigger>
              <AppMenuSubContent sideOffset={4} alignOffset={-4}>
                {knownProjects.map((project) => (
                  <AppMenuItem
                    key={project.path}
                    disabled={!project.available}
                    title={project.path}
                    onClick={() => {
                      void onSelectProject?.(project.path);
                    }}
                  >
                    {project.name} · {project.path}{project.available ? "" : ` · ${t("settings.projectsUnavailable")}`}
                  </AppMenuItem>
                ))}
              </AppMenuSubContent>
            </AppMenuSub>
          ) : null}
          <AppMenuItem onClick={() => { void onChooseProject(); }}>
            {t("lyra-agents-composer.newProject")}
          </AppMenuItem>
        </AppMenuContent>
      </AppMenu>
    );
  }

  const reveal = () => {
    if (workingDir) {
      void desktopApi?.revealInFolder(workingDir).catch((error: unknown) => {
        reportWorkbenchError(error, t("appStatus.revealPathFailed"));
      });
    }
  };
  const openEditor = (editorId: string) => {
    if (workingDir) {
      void desktopApi?.openInEditor({ editorId, path: workingDir }).catch((error: unknown) => {
        reportWorkbenchError(error, t("appStatus.openEditorFailed"));
      });
    }
  };

  return (
    <AppMenu>
      <AppMenuTrigger asChild>
        {chipTrigger}
      </AppMenuTrigger>
      <AppMenuContent align="start" sideOffset={4}>
        <AppMenuItem onClick={() => { void onOpenProjectTree(); }}>
          {t("header.openProjectTree")}
        </AppMenuItem>
        <AppMenuItem onClick={() => { if (workingDir) void onOpenInFileManager(workingDir); }}>
          {t("header.openInFileManager")}
        </AppMenuItem>
        <AppMenuItem onClick={reveal}>
          {t("header.revealInFileManager")}
        </AppMenuItem>
        {editors.length > 0 ? <AppMenuSeparator /> : null}
        {editors.map((editor) => (
          <AppMenuItem key={editor.id} onClick={() => openEditor(editor.id)}>
            <span className={EDITOR_MENU_ROW_CLASS}>
              {editor.icon ? <img src={editor.icon} alt="" className={EDITOR_MENU_ICON_CLASS} /> : null}
              {formatMessage("header.openInEditor", { editor: editor.label })}
            </span>
          </AppMenuItem>
        ))}
      </AppMenuContent>
    </AppMenu>
  );
}
