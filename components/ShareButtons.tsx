'use client';

import { useState, useEffect } from 'react';
import { Share2, Link2, Check, MessageSquare } from 'lucide-react';
import { FaWhatsapp, FaXTwitter, FaFacebookF, FaInstagram } from 'react-icons/fa6';

interface ShareButtonsProps {
  url: string;
  title: string;
  text: string;
}

const ICON_BTN_SHADOW = '0 2px 8px rgba(0,0,0,0.12)';

function IconBtn({
  label,
  href,
  onClick,
  color,
  children,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  color?: string;
  children: React.ReactNode;
}) {
  const cls =
    'w-9 h-9 rounded-full bg-white border border-[#E5E0D3] flex items-center justify-center ' +
    'transition-all duration-150 hover:-translate-y-px hover:border-[var(--i2p-gold-bright)] flex-shrink-0';

  const style = {
    color: color ?? 'var(--i2p-ink)',
    boxShadow: ICON_BTN_SHADOW,
  };

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} aria-label={label} style={style}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls} aria-label={label} style={style}>
      {children}
    </button>
  );
}

export default function ShareButtons({ url, title, text }: ShareButtonsProps) {
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [igCopied, setIgCopied] = useState(false);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && 'share' in navigator);
  }, []);

  const handleNativeShare = async () => {
    try {
      await navigator.share({ title, text, url });
    } catch {
      // user cancelled or not supported
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInstagram = () => {
    navigator.clipboard.writeText(url);
    setIgCopied(true);
    window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
    setTimeout(() => setIgCopied(false), 4000);
  };

  const payload = encodeURIComponent(`${text} ${url}`);

  return (
    <div className="flex flex-col items-center gap-3">
      {canNativeShare && (
        <button
          type="button"
          onClick={handleNativeShare}
          className="gold-gradient inline-flex items-center gap-2 px-6 py-2.5 font-semibold rounded-lg transition-all hover:brightness-105 text-sm"
          style={{ color: '#2D1A00', border: '1.5px solid #7A5C0A' }}
        >
          <Share2 className="w-4 h-4" />
          Share My Results
        </button>
      )}

      <div className="flex items-center gap-2">
        <IconBtn label="Copy link" onClick={handleCopy}>
          {copied ? <Check className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
        </IconBtn>

        <IconBtn label="Share via SMS" href={`sms:?&body=${payload}`}>
          <MessageSquare className="w-4 h-4" />
        </IconBtn>

        <IconBtn label="Share on WhatsApp" href={`https://wa.me/?text=${payload}`} color="#25D366">
          <FaWhatsapp size={16} />
        </IconBtn>

        <IconBtn
          label="Share on X"
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
          color="#000000"
        >
          <FaXTwitter size={16} />
        </IconBtn>

        <IconBtn
          label="Share on Facebook"
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
          color="#1877F2"
        >
          <FaFacebookF size={16} />
        </IconBtn>

        <IconBtn label="Share on Instagram" onClick={handleInstagram} color="#E1306C">
          <FaInstagram size={16} />
        </IconBtn>
      </div>

      {igCopied && (
        <p className="text-xs text-center" style={{ color: 'var(--i2p-text-on-dark-dim)' }}>
          Link copied — paste it in your bio or a DM.
        </p>
      )}
    </div>
  );
}
