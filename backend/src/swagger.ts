// src/swagger.ts (atualizado com definições de catálogos)
import { Express } from 'express';
import swaggerJsdoc, { Options } from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const swaggerOptions: Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Catalogo de Produtos Backend API',
      version: '1.0.0',
      description: 'Documentação da API do Backend do Catálogo de Produtos'
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Servidor local' }
    ],
    components: {
      schemas: {
        // Schemas existentes
        AuthRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' }
          }
        },
        AuthResponse: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            message: { type: 'string' }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            email: { type: 'string' },
            name: { type: 'string' },
            role: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        
        // Novos schemas para catálogos
        CatalogoStatus: {
          type: 'string',
          enum: ['ATIVO', 'INATIVO']
        },
        
        Catalogo: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            nome: { type: 'string' },
            cpf_cnpj: { type: 'string', nullable: true },
            numero: { type: 'integer' },
            status: { $ref: '#/components/schemas/CatalogoStatus' },
            ultima_alteracao: { type: 'string', format: 'date-time' }
          }
        },
        
        CreateCatalogoRequest: {
          type: 'object',
          required: ['nome', 'status'],
          properties: {
            nome: { type: 'string' },
            cpf_cnpj: { type: 'string' },
            status: { $ref: '#/components/schemas/CatalogoStatus' }
          }
        },
        
        UpdateCatalogoRequest: {
          type: 'object',
          required: ['nome', 'status'],
          properties: {
            nome: { type: 'string' },
            cpf_cnpj: { type: 'string' },
            status: { $ref: '#/components/schemas/CatalogoStatus' }
          }
        }
      },
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./src/routes/*.ts']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

export function setupSwagger(app: Express) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}