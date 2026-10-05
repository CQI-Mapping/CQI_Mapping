declare module '@tensorflow-models/universal-sentence-encoder' {
  export function load(): Promise<{
    embed(inputs: string[]): {
      array: () => Promise<number[][]>
      dispose?: () => void
    }
  }>
}
