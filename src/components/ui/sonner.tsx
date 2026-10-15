import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      gap={8}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-[18px]" strokeWidth={1.75} />,
        info: <InfoIcon className="size-[18px]" strokeWidth={1.75} />,
        warning: <TriangleAlertIcon className="size-[18px]" strokeWidth={1.75} />,
        error: <OctagonXIcon className="size-[18px] text-down" strokeWidth={1.75} />,
        loading: <Loader2Icon className="size-[18px] animate-spin" strokeWidth={1.75} />,
      }}
      style={
        {
          "--normal-bg": "#121215",
          "--normal-text": "var(--fg)",
          "--normal-border": "#222228",
          "--border-radius": "14px",
          "--width": "380px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast !items-start !gap-3 !px-4 !py-3.5 !shadow-[0_18px_50px_rgba(0,0,0,0.45)]",
          title: "!text-[14px] !font-medium !text-fg",
          description: "!text-[12.5px] !text-fg-2 num",
          icon: "!mt-0.5",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
