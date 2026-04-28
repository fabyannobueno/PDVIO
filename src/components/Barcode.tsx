import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

interface BarcodeProps {
  value: string;
  format?: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  className?: string;
}

export function Barcode({
  value,
  format = "CODE128",
  width = 2,
  height = 60,
  displayValue = true,
  className,
}: BarcodeProps) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format,
        width,
        height,
        displayValue,
        fontSize: 14,
        margin: 8,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch (e) {
      // ignore invalid value
    }
  }, [value, format, width, height, displayValue]);

  return <svg ref={ref} className={className} />;
}
