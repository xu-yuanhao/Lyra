import type { AgentTranscriptCitation } from "../../../../../../shared/agent";
import { ComposerChipIcon } from "./composer-chip-icon";
import { citationChipAriaLabel, inlineReferenceLabel } from "./message-citation";
import { ResourceChip } from "./ResourceChip";
import { citationChipRoleClass } from "./classes";

type CitationChipViewProps = {
  citation: AgentTranscriptCitation;
  onClick?: (() => void) | undefined;
};

export const CitationChipView = ({ citation, onClick }: CitationChipViewProps) => {
  const preview = inlineReferenceLabel(citation.preview);
  return (
    <ResourceChip
      className={citationChipRoleClass(citation.role)}
      title={preview}
      ariaLabel={citationChipAriaLabel({ ...citation, preview })}
      icon={<ComposerChipIcon kind={citation.role} />}
      label={preview}
      onActivate={onClick}
    />
  );
};
