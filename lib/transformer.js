"use strict";
var __spreadArray =
  (this && this.__spreadArray) ||
  function (to, from, pack) {
    if (pack || arguments.length === 2)
      for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
          if (!ar) ar = Array.prototype.slice.call(from, 0, i);
          ar[i] = from[i];
        }
      }
    return to.concat(ar || Array.prototype.slice.call(from));
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.rhTransformer = void 0;
var ts = require("typescript");
var RH_RUNTIME = "react-hot-ts";
var rhRuntime;
var keepArrows;
/**
 * TypeScript AST transformer
 * Wraps React classes and functional components for HMR
 */
function rhTransformer(options) {
  var disabled = applyOptions(options);
  if (disabled || process.env.NODE_ENV === "production") {
    console.log("[react-hot-ts] disabled for production");
    return prodTransformer;
  }
  return devTransformer;
}
exports.rhTransformer = rhTransformer;
/**
 * Production transformer replaces the HMR logic with a no-op
 */
function prodTransformer() {
  var visitor = function (node) {
    if (isSourceFileObject(node)) {
      // replace `react-hot-ts` imports by a cold version for production
      if (
        node.imports &&
        node.imports.find(function (imp) {
          return imp.text === "react-hot-ts";
        })
      ) {
        var statements = node.statements.map(function (s) {
          if (
            ts.isImportDeclaration(s) &&
            ts.isStringLiteral(s.moduleSpecifier) &&
            s.moduleSpecifier.text === "react-hot-ts"
          ) {
            return ts.factory.updateImportDeclaration(
              s,
              s.decorators,
              s.modifiers,
              s.importClause,
              ts.factory.createStringLiteral("react-hot-ts/cold.js")
            );
          } else return s;
        });
        return ts.factory.updateSourceFile(node, statements);
      }
    }
    return node;
  };
  return function (node) {
    return ts.visitNode(node, visitor);
  };
}
/**
 * Development transformer registers all the module exports (of TSX files)
 * so that they can be proxied and updated live if they happen
 * to be React components/functions
 */
function devTransformer() {
  var visitor = function (node) {
    if (isSourceFileObject(node) && !shouldSkipSourceFile(node)) {
      // add exports registration
      var statements = __spreadArray(
        __spreadArray([], visitStatements(node.statements), true),
        [
          ts.factory.createEmptyStatement(),
          ts.factory.createExpressionStatement(
            ts.factory.createImmediatelyInvokedFunctionExpression(
              __spreadArray(
                __spreadArray([], createHotStatements(node.fileName), true),
                createRegistrations(node.symbol.exports, node.fileName),
                true
              )
            )
          ),
        ],
        false
      );
      return ts.factory.updateSourceFile(node, statements);
    }
    return node;
  };
  return function (node) {
    return ts.visitNode(node, visitor);
  };
}
/**
 * Apply defaults and user options
 */
function applyOptions(options) {
  rhRuntime = RH_RUNTIME;
  if (!options) return false;
  if (typeof options.rhRuntime === "string") {
    rhRuntime = options.rhRuntime;
  }
  if (options.keepArrows !== undefined) {
    keepArrows = options.keepArrows;
  }
  return !!options.disable;
}
function visitStatements(statements) {
  if (keepArrows) return statements;
  return Array.prototype.map.call(statements, function (statement) {
    if (ts.isClassDeclaration(statement) && hasArrowFunctions(statement)) {
      var members = transformArrows(statement.members);
      return ts.factory.updateClassDeclaration(
        statement,
        statement.decorators,
        statement.modifiers,
        ts.factory.createIdentifier(statement.name.text),
        statement.typeParameters,
        statement.heritageClauses,
        members
      );
    }
    return statement;
  });
}
// transform arrow-function members into prototype-backed functions
function transformArrows(members) {
  var extraMembers = [];
  var newMembers = members.map(function (member) {
    if (ts.isPropertyDeclaration(member) && member.initializer && ts.isArrowFunction(member.initializer)) {
      var fun = member.initializer;
      var body = getBody(fun);
      if (!body) return member;
      var name_1 = getValueName(member);
      var protoName = "_hmr_" + name_1;
      var modifiers = getModifiers(fun.modifiers);
      // create new prototype method with arrow function body
      extraMembers.push(
        ts.factory.createMethodDeclaration(
          undefined,
          modifiers,
          undefined,
          protoName,
          undefined,
          undefined,
          fun.parameters,
          fun.type,
          body
        )
      );
      // replace arrow function body to invoke new method
      var wrapperBody = ts.factory.createCallExpression(createFieldApplyExpression(protoName), undefined, [
        ts.factory.createThis(),
        ts.factory.createIdentifier("args"),
      ]);
      var wrapper = ts.factory.createArrowFunction(
        undefined,
        undefined,
        [createDotArgs()],
        fun.type,
        undefined,
        wrapperBody
      );
      return ts.factory.updatePropertyDeclaration(
        member,
        member.decorators,
        member.modifiers,
        getValueName(member),
        undefined,
        undefined,
        wrapper
      );
    }
    return member;
  });
  return __spreadArray(__spreadArray([], newMembers, true), extraMembers, true);
}
function createDotArgs() {
  // `...args`
  return ts.factory.createParameterDeclaration(
    undefined,
    undefined,
    ts.factory.createToken(ts.SyntaxKind.DotDotDotToken),
    "args"
  );
}
function createFieldApplyExpression(name) {
  // `this.field.apply`
  return ts.factory.createPropertyAccessExpression(
    ts.factory.createPropertyAccessExpression(ts.factory.createThis(), name),
    "apply"
  );
}
function hasArrowFunctions(decl) {
  return decl.members.find(function (member) {
    return member.kind === ts.SyntaxKind.PropertyDeclaration;
  });
}
function shouldSkipSourceFile(node) {
  if (node.__explored__) return true;
  node.__explored__ = true;
  return node.isDeclarationFile || !node.fileName.endsWith(".tsx") || node.symbol.exports.size == 0;
}
function createHotStatements(fileName) {
  return reify(
    "\n\t\tif (module.hot) module.hot.accept();\n\t\tconst register = require('"
      .concat(rhRuntime, "').register;\n\t\tconst fileName = \"")
      .concat(
        fileName,
        '";\n\t\tconst exports = typeof __webpack_exports__ !== "undefined" ? __webpack_exports__ : module.exports;\n\t'
      )
  );
}
function createRegistrations(exports, fileName) {
  var statements = [];
  var names = {};
  exports.forEach(function (value, key) {
    // find the declaration name
    var name = getValueName(value.valueDeclaration) || value.name || key;
    if (name === "default" && value.declarations) {
      var declName = getDeclName(value.declarations[0]);
      if (declName) name = declName;
    }
    if (name === "default") {
      name = getFileName(fileName) || "default";
    }
    // ensure unique locally
    if (names[name]) {
      name = "".concat(name, "_").concat(names[name]++);
    } else {
      names[name] = 1;
    }
    // generate registration
    statements.push(reify("register(exports.".concat(key, ', "').concat(name, '", fileName)'))[0]);
  });
  return statements;
}
function getFileName(fileName) {
  var m = /([^.\/\\]+).tsx?$/.exec(fileName);
  return m && m[1] ? m[1] : undefined;
}
function getBody(node) {
  if (ts.isArrowFunction(node)) {
    return ts.isBlock(node.body) ? node.body : ts.factory.createBlock([ts.factory.createReturnStatement(node.body)]);
  } else if (ts.isFunctionDeclaration(node)) {
    return node.body;
  }
  return undefined;
}
function getModifiers(modifiers) {
  var newModifiers = [ts.factory.createModifier(ts.SyntaxKind.PrivateKeyword)];
  if (modifiers) {
    return __spreadArray(
      __spreadArray([], newModifiers, true),
      modifiers.filter(function (m) {
        return (
          m.kind !== ts.SyntaxKind.PublicKeyword &&
          m.kind !== ts.SyntaxKind.ProtectedKeyword &&
          m.kind !== ts.SyntaxKind.PrivateKeyword
        );
      }),
      true
    );
  }
  return newModifiers;
}
function getValueName(node) {
  return (node && node.name && node.name.kind === ts.SyntaxKind.Identifier && node.name.text) || undefined;
}
function getDeclName(decl) {
  return decl && ts.isExportAssignment(decl) && ts.isIdentifier(decl.expression) ? decl.expression.text : undefined;
}
/* Extra typing of intermediary AST objects */
function isSourceFileObject(node) {
  return ts.isSourceFile(node) && node.hasOwnProperty("symbol");
}
/* Reification helper: create AST from source */
var reified = {};
function reify(source, noCache) {
  if (!noCache && reified[source]) {
    return reified[source];
  }
  var sourceFile = ts.createSourceFile("template.ts", source, ts.ScriptTarget.ES2015, true, ts.ScriptKind.TS);
  var result = Array.prototype.filter.call(sourceFile.statements, function (s) {
    return !ts.isEmptyStatement(s);
  });
  anonymize(result);
  if (!noCache) reified[source] = result;
  return result;
}
// Remove position information from nodes, otherwise broken code is generated
function anonymize(o) {
  if (o.kind) o.pos = o.end = -1;
  for (var p in o) {
    if (p === "parent" || !o.hasOwnProperty(p)) continue;
    var v = o[p];
    var t = typeof v;
    if (t === "object") anonymize(v);
  }
}
