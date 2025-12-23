import * as React from "react"

import { cn } from "../../lib/utils"

type InputProps = Omit<React.ComponentProps<"input">, "size"> & {
  size?: "sm" | "default"
}

const inputClassName = (className?: string) => cn(
  "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input w-full min-w-0 rounded border bg-transparent px-3 py-1 text-base transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-1",
  "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  "data-[size=default]:h-8 data-[size=sm]:h-7",
  className
)

function Input({
  className,
  type,
  size = "default",
  ...props
}: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      data-size={size}
      className={inputClassName(className)}
      {...props}
    />
  )
}

/**
 * BufferedInput maintains local state while focused to prevent value reset during typing.
 * Only syncs external value changes when the input is not focused.
 *
 * For number inputs: keeps string representation locally to avoid conversion issues while typing.
 */
type BufferedInputProps = InputProps & {
  value: string | number | readonly string[]
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

function BufferedInput({
  value,
  onChange,
  className,
  type,
  size = "default",
  onFocus,
  onBlur,
  ...props
}: BufferedInputProps) {
  const [localValue, setLocalValue] = React.useState(() => String(value ?? ''))
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Sync external value only when input is not focused
  React.useEffect(() => {
    if (inputRef.current !== document.activeElement) {
      setLocalValue(String(value ?? ''))
    }
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value)
    onChange(e)
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // Sync with external value on blur
    setLocalValue(String(value ?? ''))
    onBlur?.(e)
  }

  return (
    <input
      ref={inputRef}
      type={type}
      data-slot="input"
      data-size={size}
      className={inputClassName(className)}
      value={localValue}
      onChange={handleChange}
      onFocus={onFocus}
      onBlur={handleBlur}
      {...props}
    />
  )
}

export { Input, BufferedInput }
