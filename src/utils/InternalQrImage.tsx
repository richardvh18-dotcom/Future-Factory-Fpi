import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';

const qrDataUrlCache = new Map<string, string>();

type InternalQrImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & {
  value: unknown;
  size?: number;
  alt?: string;
};

const InternalQrImage = ({
  value,
  size = 128,
  className = '',
  alt = 'QR',
  ...imgProps
}: InternalQrImageProps) => {
  const qrValue = useMemo(() => String(value || '').trim(), [value]);
  const [src, setSrc] = useState<string>('');

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
      setSrc((prev) => prev !== cached ? cached : prev);
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
      .then((dataUrl: string) => {
        if (!mounted) return;
        qrDataUrlCache.set(cacheKey, dataUrl);
        setSrc(dataUrl);
      })
      .catch(() => {
        if (!mounted) return;
        setSrc('');
      });

    return () => {
      mounted = false;
    };
  }, [qrValue, size]);

  if (!src) {
    return <div className={className} aria-label={alt} />;
  }

  return <img src={src} alt={alt} className={className} {...imgProps} />;
};

export default InternalQrImage;