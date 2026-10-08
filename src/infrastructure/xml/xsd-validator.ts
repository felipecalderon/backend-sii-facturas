import fs from 'node:fs';
import path from 'node:path';
import { validateXML } from 'xmllint-wasm';

export interface XsdValidationResult {
  isValid: boolean;
  errors: string[];
}

export class XsdValidator {
  private static dteXsdContent?: string;
  private static envioDteXsdContent?: string;
  private static siiTypesXsdContent?: string;
  private static xmldsigXsdContent?: string;

  public static async validateDte(
    xmlContent: string
  ): Promise<XsdValidationResult> {
    XsdValidator.loadSchemas();

    return XsdValidator.validateAgainst(xmlContent, {
      fileName: 'DTE_v10.xsd',
      contents: XsdValidator.dteXsdContent!
    });
  }

  public static async validateEnvioDte(
    xmlContent: string
  ): Promise<XsdValidationResult> {
    XsdValidator.loadSchemas();

    const result = await XsdValidator.validateAgainst(xmlContent, {
      fileName: 'EnvioDTE_v10.xsd',
      contents: XsdValidator.envioDteXsdContent!
    });
    if (
      !result.isValid ||
      XsdValidator.getRootElementName(xmlContent) === 'EnvioDTE'
    ) {
      return result;
    }

    return {
      isValid: false,
      errors: ['El elemento raíz debe ser <EnvioDTE>.']
    };
  }

  private static getRootElementName(xmlContent: string): string | undefined {
    const xmlWithoutProlog = xmlContent.replace(
      /^\uFEFF?\s*(?:(?:<\?[\s\S]*?\?>|<!--[\s\S]*?-->)\s*)*/,
      ''
    );
    const rootMatch = xmlWithoutProlog.match(
      /^<(?:[^:\s/>]+:)?([^:\s/>]+)(?=[\s/>])/
    );

    return rootMatch?.[1];
  }

  private static async validateAgainst(
    xmlContent: string,
    schema: { fileName: string; contents: string }
  ): Promise<XsdValidationResult> {
    try {
      const result = await validateXML({
        xml: xmlContent,
        schema,
        preload: XsdValidator.buildPreload(schema.fileName)
      });

      return {
        isValid: result.valid,
        errors: result.errors.map((e) => e.rawMessage || e.message)
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [(error as Error).message]
      };
    }
  }

  private static buildPreload(
    mainSchemaFileName: string
  ): Array<{ fileName: string; contents: string }> {
    return [
      {
        fileName: 'DTE_v10.xsd',
        contents: XsdValidator.dteXsdContent!
      },
      {
        fileName: 'SiiTypes_v10.xsd',
        contents: XsdValidator.siiTypesXsdContent!
      },
      {
        fileName: 'xmldsignature_v10.xsd',
        contents: XsdValidator.xmldsigXsdContent!
      }
    ].filter((schema) => schema.fileName !== mainSchemaFileName);
  }

  private static loadSchemas(): void {
    if (XsdValidator.dteXsdContent) {
      return;
    }

    const schemasDir = path.resolve(process.cwd(), 'docs/schemas-sii');
    XsdValidator.dteXsdContent = fs.readFileSync(
      path.join(schemasDir, 'DTE_v10.xsd'),
      'utf-8'
    );
    XsdValidator.envioDteXsdContent = fs.readFileSync(
      path.join(schemasDir, 'EnvioDTE_v10.xsd'),
      'utf-8'
    );
    XsdValidator.siiTypesXsdContent = fs.readFileSync(
      path.join(schemasDir, 'SiiTypes_v10.xsd'),
      'utf-8'
    );
    XsdValidator.xmldsigXsdContent = fs.readFileSync(
      path.join(schemasDir, 'xmldsignature_v10.xsd'),
      'utf-8'
    );
  }
}
