export interface ParsedFunction {
  name: string;
  body: string;
}

export interface ParsedMethod {
  name: string;
  body: string;
  className?: string;
  receiverType?: string;
}

export interface ParsedClass {
  name: string;
  body: string;
}

export interface ParsedFileAst {
  functions: ParsedFunction[];
  classes: ParsedClass[];
  methods: ParsedMethod[];
  calls: string[];
  imports: string[];
}

export function createEmptyParsedFileAst(): ParsedFileAst {
  return {
    functions: [],
    classes: [],
    methods: [],
    calls: [],
    imports: [],
  };
}
