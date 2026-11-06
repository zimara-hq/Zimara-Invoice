"use client";
import { useActionState } from "react";

/**
 * useActionState for <form action={...}> (works before hydration, posts — never puts fields in the URL).
 * Actions return `t` with their error state; forms use it as `key` so a failed submit remounts
 * the form with the user's values (`values`) instead of React's automatic reset clearing them.
 */
export function useFormAction<S>(action: (state: Awaited<S>, fd: FormData) => S | Promise<S>, initial: Awaited<S>) {
  return useActionState(action, initial);
}
