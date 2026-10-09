export type ShopFont = string;

export const SHOP_FONTS: { key: ShopFont; label: string; family: string; googleCss: string | null }[] = [
  { key: 'system', label: 'Standard (System)', family: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', googleCss: null },
  { key: 'inter', label: 'Inter', family: 'Inter, sans-serif', googleCss: 'Inter:wght@400;600;800' },
  { key: 'roboto', label: 'Roboto', family: 'Roboto, sans-serif', googleCss: 'Roboto:wght@400;500;700;900' },
  { key: 'open-sans', label: 'Open Sans', family: '"Open Sans", sans-serif', googleCss: 'Open+Sans:wght@400;600;800' },
  { key: 'lato', label: 'Lato', family: 'Lato, sans-serif', googleCss: 'Lato:wght@400;700;900' },
  { key: 'montserrat', label: 'Montserrat', family: 'Montserrat, sans-serif', googleCss: 'Montserrat:wght@400;600;800' },
  { key: 'poppins', label: 'Poppins', family: 'Poppins, sans-serif', googleCss: 'Poppins:wght@400;600;800' },
  { key: 'nunito', label: 'Nunito', family: 'Nunito, sans-serif', googleCss: 'Nunito:wght@400;600;800' },
  { key: 'raleway', label: 'Raleway', family: 'Raleway, sans-serif', googleCss: 'Raleway:wght@400;600;800' },
  { key: 'work-sans', label: 'Work Sans', family: '"Work Sans", sans-serif', googleCss: 'Work+Sans:wght@400;600;800' },
  { key: 'source-sans-3', label: 'Source Sans 3', family: '"Source Sans 3", sans-serif', googleCss: 'Source+Sans+3:wght@400;600;800' },
  { key: 'dm-sans', label: 'DM Sans', family: '"DM Sans", sans-serif', googleCss: 'DM+Sans:wght@400;600;800' },
  { key: 'manrope', label: 'Manrope', family: 'Manrope, sans-serif', googleCss: 'Manrope:wght@400;600;800' },
  { key: 'rubik', label: 'Rubik', family: 'Rubik, sans-serif', googleCss: 'Rubik:wght@400;600;800' },
  { key: 'figtree', label: 'Figtree', family: 'Figtree, sans-serif', googleCss: 'Figtree:wght@400;600;800' },
  { key: 'palanquin', label: 'Palanquin', family: 'Palanquin, sans-serif', googleCss: 'Palanquin:wght@400;600;700' },
  { key: 'barlow', label: 'Barlow', family: 'Barlow, sans-serif', googleCss: 'Barlow:wght@400;600;800' },
  { key: 'fira-sans', label: 'Fira Sans', family: '"Fira Sans", sans-serif', googleCss: 'Fira+Sans:wght@400;600;800' },
  { key: 'archivo', label: 'Archivo', family: 'Archivo, sans-serif', googleCss: 'Archivo:wght@400;600;800' },
  { key: 'josefin-sans', label: 'Josefin Sans', family: '"Josefin Sans", sans-serif', googleCss: 'Josefin+Sans:wght@400;600;700' },
  { key: 'quicksand', label: 'Quicksand', family: 'Quicksand, sans-serif', googleCss: 'Quicksand:wght@400;600;700' },
  { key: 'oswald', label: 'Oswald', family: 'Oswald, sans-serif', googleCss: 'Oswald:wght@400;600;700' },
  { key: 'bebas-neue', label: 'Bebas Neue', family: '"Bebas Neue", sans-serif', googleCss: 'Bebas+Neue' },
  { key: 'playfair-display', label: 'Playfair Display', family: '"Playfair Display", serif', googleCss: 'Playfair+Display:wght@400;600;800' },
  { key: 'merriweather', label: 'Merriweather', family: 'Merriweather, serif', googleCss: 'Merriweather:wght@400;700;900' },
  { key: 'lora', label: 'Lora', family: 'Lora, serif', googleCss: 'Lora:wght@400;600;700' },
];

export function fontByKey(key: string | null | undefined) {
  return SHOP_FONTS.find((font) => font.key === key) ?? SHOP_FONTS[0];
}
