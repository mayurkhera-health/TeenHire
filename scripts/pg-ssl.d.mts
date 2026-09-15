/* So the test can import the script's copy of the rule and compare it with the
   app's. The script itself stays plain JavaScript because it runs inside the
   standalone image, which has no TypeScript toolchain. */
export function sslFor(url: string): false | { rejectUnauthorized: boolean } | undefined;
