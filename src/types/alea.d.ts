declare module 'alea' {
  export interface AleaPRNG {
    (): number
    uint32(): number
    fract53(): number
  }
  export default function alea(...seed: (string | number)[]): AleaPRNG
}
