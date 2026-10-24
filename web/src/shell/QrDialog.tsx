// Big QR that opens the app: a phone scans it, lands on "/" and CloudGate asks for sign-in when there is no session.
import { useMemo } from "react";
import qrcode from "qrcode-generator";
import { useT } from "../i18n";
import { Dialog } from "./ui";

export function QrDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const url = window.location.origin + "/";
  const svg = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    return qr.createSvgTag({ cellSize: 1, margin: 0, scalable: true });
  }, [url]);
  return (
    <Dialog title={t("qr.title")} onClose={onClose}>
      <div className="qr-box">
        <div className="qr-code" role="img" aria-label={t("qr.alt")} dangerouslySetInnerHTML={{ __html: svg }} />
        <a className="qr-url" href={url} data-autofocus>{url}</a>
      </div>
    </Dialog>
  );
}
