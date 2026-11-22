import { BookOpen, Check, Eye, FileCode, SplitSquareHorizontal, SplitSquareVertical } from "@lyra/icons";
import { Button } from "@renderer/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@renderer/ui/components/dropdown-menu";
import { t } from "@workbench/i18n";

import { previewKindFromPath, type FilePreviewLayout } from "./kinds";
import { setFilePreviewLayout, useFilePreviewLayout } from "./layout-store";

const OPTIONS: ReadonlyArray<{
  readonly value: FilePreviewLayout;
  readonly icon: typeof FileCode;
  readonly labelKey:
    | "editor.viewSource"
    | "editor.viewSplitHorizontal"
    | "editor.viewSplitVertical"
    | "editor.viewPreview";
}> = [
  { value: "source", icon: FileCode, labelKey: "editor.viewSource" },
  { value: "split-horizontal", icon: SplitSquareHorizontal, labelKey: "editor.viewSplitHorizontal" },
  { value: "split-vertical", icon: SplitSquareVertical, labelKey: "editor.viewSplitVertical" },
  { value: "preview", icon: Eye, labelKey: "editor.viewPreview" }
];

export const FilePreviewModeButton = ({
  filePath
}: {
  readonly filePath: string | null;
}) => {
  const kind = filePath === null ? null : previewKindFromPath(filePath);
  const layout = useFilePreviewLayout(filePath ?? "");
  if (filePath === null || kind === null) {
    return null;
  }
  const TriggerIcon = kind === "paper" ? BookOpen : Eye;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-[var(--lyra-shell-titlebar-nav-h)] rounded-full p-0 text-[var(--lyra-text-muted)] hover:bg-transparent hover:text-[var(--lyra-text-primary)]"
          aria-label={t("editor.viewMode")}
          title={t("editor.viewMode")}
        >
          <TriggerIcon size={14} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => {
                setFilePreviewLayout(filePath, option.value);
              }}
            >
              <Icon size={14} aria-hidden="true" />
              <span>{t(option.labelKey)}</span>
              {layout === option.value ? <Check size={14} aria-hidden="true" className="ml-auto" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
