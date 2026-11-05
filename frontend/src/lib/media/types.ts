/**
 * What the logo sits on — drives which monochrome logos get inverted.
 * - 'theme': the viewer theme (hero, anything light-sensitive)
 * - 'dark': an always-dark backdrop (cards scrim behind their logos)
 * - 'light': an always-light backdrop
 * - 'none': no contrast logic, only the base shadow
 */
export type LogoBackground = 'theme' | 'light' | 'dark' | 'none'
