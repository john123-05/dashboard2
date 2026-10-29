import type { CSSProperties } from 'react';
import { photoRotationForPark } from '../lib/photoBrowser';

// Foto eines Parks anzeigen; bei quer eingebauten Kameras (Tarzans, Oderwitz) aufrecht gedreht.
// Gedreht wird nur in der Anzeige: die Box gibt die Größe vor, das Bild bekommt Breite und Höhe
// vertauscht (Container-Einheiten) und wird um die Mitte gedreht.
export default function ParkPhotoImg({
  src, parkId, alt = '', className = '', boxClassName = '', fit = 'cover', loading,
}: {
  src: string; parkId: string | null | undefined; alt?: string; className?: string; boxClassName?: string;
  fit?: 'cover' | 'contain'; loading?: 'lazy' | 'eager';
}) {
  const rotation = photoRotationForPark(parkId);
  if (!rotation) return <img src={src} alt={alt} className={className} loading={loading} />;
  const img: CSSProperties = {
    position: 'absolute', top: '50%', left: '50%', width: '100cqh', height: '100cqw', maxWidth: 'none',
    objectFit: fit, transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
  };
  return (
    <span className={`relative block overflow-hidden ${boxClassName}`} style={{ containerType: 'size' }}>
      <img src={src} alt={alt} style={img} loading={loading} />
    </span>
  );
}
