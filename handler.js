import { fileURLToPath } from 'url';
import path from 'path';
import { Readable } from 'stream';
import * as fs from 'fs';
import fsPromises from 'fs/promises';
import Busboy from 'busboy';
import xml2js from 'xml2js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const xml_editor = async (event, context) => {

    if (event.httpMethod === 'GET' && event.path === '/') {
        try {
            const html = await fsPromises.readFile(path.join(__dirname, 'index.html'), 'utf8');
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'text/html',
                },
                body: html,
            };
        } catch (error) {
            console.error('Error reading HTML:', error);
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Internal server error' }),
            };
        }
    }

    if (event.httpMethod === 'POST' && event.path === '/upload') {
        try {
            const contentType = event.headers['content-type'] || event.headers['Content-Type'];
            if (!contentType || !contentType.startsWith('multipart/form-data')) {
                return {
                    statusCode: 400,
                    body: JSON.stringify({ message: 'Invalid content type. Expected multipart/form-data.' }),
                };
            }

            const bodyBuffer = event.isBase64Encoded
                ? Buffer.from(event.body, 'base64')
                : Buffer.from(event.body, 'utf8');

            const busboyStream = new Readable({
                read() {},
            });
            busboyStream.push(bodyBuffer);
            busboyStream.push(null);

            const form = Busboy({ headers: event.headers });

            let fileBuffer = null;
            let originalFilename = 'unknown.xml';

            return new Promise((resolve, reject) => {
                busboyStream.pipe(form);

                form.on('file', (fieldname, file, info) => {
                    if (fieldname === 'xmlFile') {
                        originalFilename = info.filename || 'unknown.xml';
                        const chunks = [];
                        file.on('data', (chunk) => {
                            chunks.push(chunk);
                        });
                        file.on('end', () => {
                            fileBuffer = Buffer.concat(chunks);
                        });
                        file.on('error', reject);
                    }
                });

                form.on('finish', async () => {
                    try {
                        if (!fileBuffer) {
                            throw new Error('No XML file uploaded');
                        }

                        console.log('File uploaded:', originalFilename);

                        const data = fileBuffer.toString('utf8');

                        const parser = new xml2js.Parser({ explicitArray: false });
                        const result = await parser.parseStringPromise(data);

                        const invoices = Array.isArray(result.ExportedData.Invoice)
                            ? result.ExportedData.Invoice
                            : [result.ExportedData.Invoice];

                        for (const invoice of invoices) {
                            if (
                                invoice.BuyerInfo &&
                                (!invoice.BuyerInfo.DeliveryLocation || invoice.BuyerInfo.DeliveryLocation === '')
                            ) {
                                if (
                                    invoice.SupplierInfo &&
                                    invoice.SupplierInfo.Taxpayer &&
                                    invoice.SupplierInfo.Taxpayer.AdditionalData
                                ) {
                                    const additionalInfo = invoice.SupplierInfo.Taxpayer.AdditionalData;
                                    const parts = additionalInfo.split(',');
                                    const locationText = parts.slice(1).join(',').trim();
                                    invoice.BuyerInfo.DeliveryLocation = locationText;
                                }
                            }
                        }

                        const builder = new xml2js.Builder({
                            xmldec: { version: '1.0', encoding: 'UTF-8', standalone: true }
                        });
                        const newXml = builder.buildObject(result);

                        const originalName = path.parse(originalFilename).name;
                        const editedFilename = `${originalName}-edited.xml`;

                        resolve({
                            statusCode: 200,
                            headers: {
                                'Content-Type': 'application/xml',
                                'Content-Disposition': `attachment; filename="${editedFilename}"`,
                            },
                            body: newXml,
                        });
                    } catch (error) {
                        console.error('Error processing XML:', error);
                        resolve({
                            statusCode: 500,
                            body: JSON.stringify({ message: 'Error processing XML' }),
                        });
                    }
                });

                form.on('error', (error) => {
                    console.error('Busboy error:', error);
                    reject(error);
                });
            });
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