import { FolderTree, Puzzle, Search } from "@lyra/icons";

import { Button } from "@renderer/ui/components/button";
import { activityDockItems } from "./service";
import type { ActivityDockItemId, ActivityDockProps } from "./types";

const iconByItemId: Record<ActivityDockItemId, JSX.Element> = {
  explorer: <FolderTree size={17} aria-hidden="true" />,
  search: <Search size={17} aria-hidden="true" />,
  plugins: <Puzzle size={17} aria-hidden="true" />
};

export const ActivityDock = ({ activeItemId, onSelect }: ActivityDockProps) => (
  <nav className="flex flex-col" aria-label="activity-dock">
    {activityDockItems.map((item) => {
      const active = item.id === activeItemId;
      return (
        <Button
          key={item.id}
          variant="ghost"
          size="icon"
          title={item.label}
          aria-label={item.label}
          aria-pressed={active}
          className={active ? "bg-[var(--lyra-app-row-active-bg)] text-[var(--lyra-text-primary)]" : ""}
          onClick={() => {
            onSelect(item.id);
          }}
        >
          {iconByItemId[item.id]}
        </Button>
      );
    })}
  </nav>
);
