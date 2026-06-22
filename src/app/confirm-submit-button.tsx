"use client";

import type React from "react";

type ConfirmSubmitButtonProps = {
  className?: string;
  message: string;
  children: React.ReactNode;
};

export function ConfirmSubmitButton({ className, message, children }: ConfirmSubmitButtonProps) {
  return (
    <button
      className={className}
      type="submit"
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
