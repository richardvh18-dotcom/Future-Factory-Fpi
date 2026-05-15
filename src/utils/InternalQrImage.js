import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
const qrDataUrlCache = new Map();
const InternalQrImage = ({ value, size = 128, className = '', alt = 'QR', ...imgProps }) => {
    const qrValue = useMemo(() => String(value || '').trim(), [value]);
    const [src, setSrc] = useState('');
    useEffect(() => {
        let mounted = true;
        if (!qrValue) {
            setSrc('');
            return () => {
                mounted = false;
            };
        }
        const cacheKey = `${size}::${qrValue}`;
        const cached = qrDataUrlCache.get(cacheKey);
        if (cached) {
            setSrc(cached);
            return () => {
                mounted = false;
            };
        }
        QRCode.toDataURL(qrValue, {
            errorCorrectionLevel: 'H',
            margin: 1,
            width: Math.max(64, Number(size) || 128),
            color: { dark: '#000000', light: '#FFFFFF' },
        })
            .then((dataUrl) => {
            if (!mounted)
                return;
            qrDataUrlCache.set(cacheKey, dataUrl);
            setSrc(dataUrl);
        })
            .catch(() => {
            if (!mounted)
                return;
            setSrc('');
        });
        return () => {
            mounted = false;
        };
    }, [qrValue, size]);
    if (!src) {
        return _jsx("div", { className: className, "aria-label": alt });
    }
    return _jsx("img", { src: src, alt: alt, className: className, ...imgProps });
};
export default InternalQrImage;
