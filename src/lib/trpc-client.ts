/**
 * tRPC React client setup (Cycle 1 Week 2 extension).
 * Provides typed hooks for client components.
 */
"use client";

import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/routers/_app";

export const trpc = createTRPCReact<AppRouter>();
