/// <reference types="nativewind/types" />

// Metro resolves the Tailwind entry through NativeWind; TypeScript needs to be
// told the side-effect import is legitimate.
declare module "*.css";
