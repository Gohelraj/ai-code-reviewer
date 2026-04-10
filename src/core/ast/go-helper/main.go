package main

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
)

type request struct {
	FilePath string `json:"filePath"`
	Content  string `json:"content"`
}

type parsedFunction struct {
	Name string `json:"name"`
	Body string `json:"body"`
}

type parsedMethod struct {
	Name         string `json:"name"`
	Body         string `json:"body"`
	ClassName    string `json:"className,omitempty"`
	ReceiverType string `json:"receiverType,omitempty"`
}

type parsedFile struct {
	Functions []parsedFunction `json:"functions"`
	Classes   []struct{}       `json:"classes"`
	Methods   []parsedMethod   `json:"methods"`
	Calls     []string         `json:"calls"`
	Imports   []string         `json:"imports"`
}

func main() {
	var req request
	if err := json.NewDecoder(os.Stdin).Decode(&req); err != nil {
		writeEmpty()
		return
	}

	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, req.FilePath, req.Content, parser.ParseComments)
	if err != nil {
		writeEmpty()
		return
	}

	result := parsedFile{
		Functions: []parsedFunction{},
		Classes:   []struct{}{},
		Methods:   []parsedMethod{},
		Calls:     []string{},
		Imports:   []string{},
	}

	callSet := map[string]struct{}{}

	for _, importSpec := range file.Imports {
		if importSpec.Path != nil {
			result.Imports = append(result.Imports, trimQuotes(importSpec.Path.Value))
		}
	}

	for _, decl := range file.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok {
			continue
		}

		body := ""
		if fn.Body != nil {
			start := fset.Position(fn.Body.Pos()).Offset
			end := fset.Position(fn.Body.End()).Offset
			if start >= 0 && end >= start && end <= len(req.Content) {
				body = req.Content[start:end]
			}
		}

		if fn.Recv == nil || len(fn.Recv.List) == 0 {
			result.Functions = append(result.Functions, parsedFunction{
				Name: fn.Name.Name,
				Body: body,
			})
		} else {
			result.Methods = append(result.Methods, parsedMethod{
				Name:         fn.Name.Name,
				Body:         body,
				ReceiverType: receiverName(fn.Recv.List[0].Type),
			})
		}

		ast.Inspect(fn, func(node ast.Node) bool {
			call, ok := node.(*ast.CallExpr)
			if !ok {
				return true
			}

			name := callName(call.Fun)
			if name != "" {
				callSet[name] = struct{}{}
			}
			return true
		})
	}

	for name := range callSet {
		result.Calls = append(result.Calls, name)
	}

	_ = json.NewEncoder(os.Stdout).Encode(result)
}

func callName(expr ast.Expr) string {
	switch target := expr.(type) {
	case *ast.Ident:
		return target.Name
	case *ast.SelectorExpr:
		return target.Sel.Name
	default:
		return ""
	}
}

func receiverName(expr ast.Expr) string {
	switch value := expr.(type) {
	case *ast.Ident:
		return value.Name
	case *ast.StarExpr:
		return receiverName(value.X)
	default:
		return ""
	}
}

func trimQuotes(value string) string {
	if len(value) >= 2 && (value[0] == '"' || value[0] == '`') {
		return value[1 : len(value)-1]
	}
	return value
}

func writeEmpty() {
	_ = json.NewEncoder(os.Stdout).Encode(parsedFile{
		Functions: []parsedFunction{},
		Classes:   []struct{}{},
		Methods:   []parsedMethod{},
		Calls:     []string{},
		Imports:   []string{},
	})
}
