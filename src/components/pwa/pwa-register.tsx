"use client";

import { useEffect } from "react";
import { startPwa } from "./pwa";

/** Mounted once in the root layout: registers /sw.js and captures the install prompt. */
export function PwaRegister() {
  useEffect(() => {
    startPwa();
  }, []);
  return null;
}
