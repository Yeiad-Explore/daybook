// Enter/exit for floating layers, driven by Base UI's data-starting-style / data-ending-style.
// prefers-reduced-motion turns transitions off globally (base.css).
export const POP =
  "origin-(--transform-origin) transition-[opacity,transform] duration-150 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0";
