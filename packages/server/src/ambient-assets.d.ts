// Ambient module shims for the non-JS asset imports webpack/CRA-style
// build tooling handles natively (CSS/SCSS Modules, images) but the
// TypeScript compiler has no built-in notion of. Without these, validating
// migrated code from any real-world repo that imports styles or images
// would always fail with a spurious "Cannot find module" — even when the
// path is completely correct and the file genuinely exists.
declare module "*.css" {
  const classes: { [key: string]: string };
  export default classes;
}
declare module "*.scss" {
  const classes: { [key: string]: string };
  export default classes;
}
declare module "*.sass" {
  const classes: { [key: string]: string };
  export default classes;
}
declare module "*.less" {
  const classes: { [key: string]: string };
  export default classes;
}
declare module "*.svg" {
  const content: string;
  export default content;
}
declare module "*.png" {
  const content: string;
  export default content;
}
declare module "*.jpg" {
  const content: string;
  export default content;
}
declare module "*.jpeg" {
  const content: string;
  export default content;
}
declare module "*.gif" {
  const content: string;
  export default content;
}
