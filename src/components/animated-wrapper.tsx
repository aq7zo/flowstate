"use client";

import { motion, type MotionProps } from "motion/react";

import { cn } from "@/lib/utils";

type AnimatedWrapperProps = MotionProps & {
  className?: string;
  children: React.ReactNode;
};

export function AnimatedWrapper({
  className,
  children,
  ...motionProps
}: AnimatedWrapperProps) {
  return (
    <motion.div className={cn(className)} {...motionProps}>
      {children}
    </motion.div>
  );
}
