import { FastifyInstance } from 'fastify';
import { User } from '../modules/users/user.model';
import { PartnerApplication } from '../modules/users/partner-application.model';
import { SystemSettings } from '../modules/admin/system-settings.model';
import { env } from '../config/env';

export const setupAdmin = async (app: FastifyInstance) => {
  // Dynamically import ESM-only modules
  const { default: AdminJS } = await import('adminjs');
  const { default: AdminJSFastify } = await import('@adminjs/fastify');
  const AdminJSMongoose = await import('@adminjs/mongoose');

  AdminJS.registerAdapter({
    Resource: AdminJSMongoose.Resource,
    Database: AdminJSMongoose.Database,
  });

  const adminOptions = {
    resources: [
      {
        resource: User,
        options: {
          properties: {
            'profile.vibeTags': { type: 'string', isArray: true },
            'profile.languages': { type: 'string', isArray: true },
            likedBy: { type: 'string', isArray: true },
          },
        },
      },
      {
        resource: PartnerApplication,
        options: {
          properties: {
            languages: { type: 'string', isArray: true },
          },
          actions: {
            approve: {
              actionType: 'record',
              icon: 'Check',
              handler: async (request: any, response: any, context: any) => {
                const { record } = context;
                
                // Update the application status
                await record.update({ status: 'approved' });
                
                // Find the associated user and update their status
                await User.findByIdAndUpdate(record.param('userId'), {
                  'settings.isListener': true,
                  'settings.isVerified': true,
                });
                
                return {
                  record: record.toJSON(context.currentAdmin),
                  notice: { message: 'Partner successfully approved', type: 'success' },
                };
              },
            },
          },
        },
      },
      SystemSettings,
    ],
    rootPath: '/admin',
    branding: {
      companyName: 'Mello Admin',
    },
  };

  const admin = new AdminJS(adminOptions);

  // Authenticated Router Setup
  await AdminJSFastify.buildAuthenticatedRouter(
    admin,
    {
      authenticate: async (email: string, password: string) => {
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@mello.com';
        const adminPassword = process.env.ADMIN_PASSWORD || 'password123';
        
        if (email === adminEmail && password === adminPassword) {
          return Promise.resolve({ email, role: 'admin' });
        }
        return null;
      },
      cookiePassword: process.env.COOKIE_PASSWORD || 'some-secret-password-used-to-secure-cookie',
      cookieName: 'adminjs',
    },
    app,
    {
      secret: process.env.COOKIE_PASSWORD || 'some-secret-password-used-to-secure-cookie',
      cookie: { secure: false } // Change to true in production with HTTPS
    }
  );

  console.log('AdminJS setup completed at /admin');
};
