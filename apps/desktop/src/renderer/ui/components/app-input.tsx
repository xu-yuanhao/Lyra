import type { ComponentProps } from "react";

import { Input } from "./input";
import { Textarea } from "./textarea";

export { Input as AppInput } from "./input";
export { Textarea as AppTextarea } from "./textarea";
export type AppInputProps = ComponentProps<typeof Input>;
export type AppTextareaProps = ComponentProps<typeof Textarea>;
