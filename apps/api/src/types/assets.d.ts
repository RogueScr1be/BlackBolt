/**
 * Module declaration for static asset imports (.pdf, etc)
 * Allows TypeScript to recognize asset imports as valid modules
 */
declare module '*.pdf' {
  const path: string;
  export default path;
}

declare module '*.png' {
  const path: string;
  export default path;
}

declare module '*.jpg' {
  const path: string;
  export default path;
}
