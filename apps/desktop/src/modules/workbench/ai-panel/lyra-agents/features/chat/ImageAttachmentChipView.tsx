import type { AgentImageAttachment } from "../../core/types";
import {
  ComposerChipIcon,
  composerChipIconKindForImage
} from "./composer-chip-icon";
import { imageAttachmentChipKind, imageAttachmentPreview, imageChipAriaLabel } from "./composer-image";
import { inlineReferenceLabel } from "./message-citation";
import { ResourceChip } from "./ResourceChip";
import { imageAttachmentChipVariantClass } from "./classes";

type ImageAttachmentChipViewProps = {
  image: AgentImageAttachment;
  onClick?: (() => void) | undefined;
};

export const ImageAttachmentChipView = ({ image, onClick }: ImageAttachmentChipViewProps) => {
  const kind = imageAttachmentChipKind(image);
  const preview = inlineReferenceLabel(imageAttachmentPreview(image), [], [], [image]);
  return (
    <ResourceChip
      className={`lyra-agents-citation-chip-attachment ${imageAttachmentChipVariantClass(kind)}`}
      title={preview}
      ariaLabel={imageChipAriaLabel(image)}
      icon={<ComposerChipIcon kind={composerChipIconKindForImage(image)} />}
      label={preview}
      onActivate={onClick}
    />
  );
};
