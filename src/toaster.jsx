import {
  Box,
  createToaster,
  Toaster,
  ToastCloseTrigger,
  ToastDescription,
  ToastIndicator,
  ToastRoot,
  ToastTitle,
} from "@chakra-ui/react";

export const toaster = createToaster({
  placement: "top-end",
  duration: 4500,
  max: 5,
});

/** Chakra v3 / Ark Toaster requires `children` as a render function for each toast. */
export function AppToaster() {
  return (
    <Toaster toaster={toaster}>
      {(toast) => (
        <ToastRoot
          width="min(380px, calc(100vw - 24px))"
          alignItems="flex-start"
          gap={3}
          px={4}
          py={3}
        >
          <ToastIndicator />
          <Box flex="1" minW={0}>
            {toast.title != null && toast.title !== "" ? (
              <ToastTitle lineHeight="1.2">{toast.title}</ToastTitle>
            ) : null}
            {toast.description != null && toast.description !== "" ? (
              <ToastDescription
                mt={1}
                whiteSpace="normal"
                wordBreak="break-word"
                lineHeight="1.35"
              >
                {toast.description}
              </ToastDescription>
            ) : null}
          </Box>
          {toast.closable ? <ToastCloseTrigger /> : null}
        </ToastRoot>
      )}
    </Toaster>
  );
}
