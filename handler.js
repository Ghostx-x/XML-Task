import { fileURLToPath } from 'url';
import path from 'path';
import fsPromises from 'fs/promises';
import xml2js from 'xml2js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const xml_editor = async (event, context) => {
    const { httpMethod, path: requestPath, headers, body, isBase64Encoded } = event;

    // if (httpMethod === 'GET' && requestPath === '/') {
    //     try {
    //         const html = await fsPromises.readFile(path.join(__dirname, 'index.html'), 'utf8');
    //         return {
    //             statusCode: 200,
    //             headers: {
    //                 'Content-Type': 'text/html',
    //             },
    //             body: html,
    //         };
    //     } catch (error) {
    //         console.error('Error reading HTML:', error);
    //         return {
    //             statusCode: 500,
    //             body: JSON.stringify({ message: 'Internal server error' }),
    //         };
    //     }
    // }

    if (httpMethod === 'POST' && requestPath === '/upload') {
        try {
            const contentType = headers['content-type'] || headers['Content-Type'] || '';
            if (!contentType.startsWith('application/xml')) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: 'Invalid content type. Expected application/xml.' }),
                };
            }

            const xmlData = isBase64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body;
            const parser = new xml2js.Parser({ explicitArray: false });
            const result = await parser.parseStringPromise(xmlData);

            const invoices = Array.isArray(result.ExportedData.Invoice)
                ? result.ExportedData.Invoice
                : [result.ExportedData.Invoice];

            for (const invoice of invoices) {
                if (invoice.SupplierInfo?.Taxpayer?.AdditionalData) {
                    const [, ...location] = invoice.SupplierInfo.Taxpayer.AdditionalData.split(",");
                    invoice.BuyerInfo.DeliveryLocation = location.join(",").trim();
                }
            }

            const builder = new xml2js.Builder({
                xmldec: { version: '1.0', encoding: 'UTF-8', standalone: true },
            });
            const newXml = builder.buildObject(result);

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/xml',
                    'Content-Disposition': 'attachment; filename="edited.xml"',
                },
                body: newXml,
            };
        } catch (error) {
            console.error('Unexpected error:', error);
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal server error' }),
            };
        }
    }

    return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Not found' }),
    };
};