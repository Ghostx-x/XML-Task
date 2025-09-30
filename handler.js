import { fileURLToPath } from 'url';
import path from 'path';
import fsPromises from 'fs/promises';
import xml2js from 'xml2js';
import AWS from 'aws-sdk';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const s3 = new AWS.S3();
const BUCKET = process.env.BUCKET_NAME;

export const xml_editor = async (event, context) => {
    const { httpMethod, path: requestPath, headers, body, isBase64Encoded } = event;


    if (httpMethod === 'GET' && requestPath === '/') {
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


    if (httpMethod === 'GET' && requestPath === '/generate-presigned-url') {
        const key = `original/${Date.now()}_${Math.floor(Math.random() * 10000)}.xml`;
        const url = await s3.getSignedUrlPromise('putObject', {
            Bucket: BUCKET,
            Key: key,
            ContentType: 'application/xml',
            Expires: 500
        });

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, key }),
        };
    }


    if (httpMethod === 'POST' && requestPath === '/upload') {
        try {
            const { key } = JSON.parse(body);

            const file = await s3.getObject({ Bucket: BUCKET, Key: key }).promise();
            const xmlData = file.Body.toString('utf-8');

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

            const processedKey = `processed/${Date.now()}_edited.xml`;

            await s3.putObject({
                Bucket: BUCKET,
                Key: processedKey,
                Body: newXml,
                ContentType: 'application/xml'
            }).promise();

            const downloadUrl = await s3.getSignedUrlPromise('getObject', {
                Bucket: BUCKET,
                Key: processedKey,
                Expires: 500
            });

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ downloadUrl }),
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
