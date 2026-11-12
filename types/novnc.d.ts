// @types/novnc__novnc still types the pre-1.5 entry point. Since 1.5 the
// package root exports the same RFB class.
declare module "@novnc/novnc" {
	export { default } from "@novnc/novnc/lib/rfb";
}
