/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */
export interface OptionsSchema {
    moduleSourceName?: string;
    extractSourceLocation?: boolean;
    messagesDir?: string;
    overrideIdFn?: (id: string, defaultMessage: string, descriptor: string, file: string) => string;
    removeDefaultMessage?: boolean;
    extractFromFormatMessageCall?: boolean;
    additionalComponentNames?: string[];
}
