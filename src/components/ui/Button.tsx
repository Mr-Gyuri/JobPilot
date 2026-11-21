"use client";

import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:outline-indigo-500 disabled:bg-indigo-400",
  secondary:
    "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800",
  ghost:
    "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
  danger:
    "bg-rose-600 text-white hover:bg-rose-700 focus-visible:outline-rose-500 disabled:bg-rose-400",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-2.5 text-xs gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, className, children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-70",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: Variant;
  size?: Size;
  /** Open in a new tab. Off-site links should set this. */
  external?: boolean;
}

/**
 * A link styled as a button. Use this instead of window.open or nesting a
 * <Button> inside a <Link>: a scripted window.open is silently killed by
 * popup-blocker extensions (a real anchor never is), and a button inside an
 * anchor is invalid HTML that confuses assistive tech.
 */
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { href, variant = "primary", size = "md", external = false, className, children, ...rest },
  ref
) {
  const classes = cn(
    "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
    VARIANTS[variant],
    SIZES[size],
    className
  );
  if (external) {
    return (
      <a ref={ref} href={href} target="_blank" rel="noopener noreferrer" className={classes} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link ref={ref} href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
});
