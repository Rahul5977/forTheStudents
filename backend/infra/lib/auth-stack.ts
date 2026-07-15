// Phase 1: identity. Cognito user pool with email + phone (OTP) sign-in and
// Google federation. The pool issues the JWT that API Gateway verifies.
import { Stack, type StackProps, Duration, CfnOutput, SecretValue } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import type { StageConfig } from './config';

export interface AuthStackProps extends StackProps {
  cfg: StageConfig;
}

export class AuthStack extends Stack {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);
    const { cfg } = props;

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `sc-${cfg.stage}`,
      selfSignUpEnabled: true,
      signInAliases: { email: true, phone: true },
      autoVerify: { email: true, phone: true }, // phone OTP via SNS SMS
      standardAttributes: {
        email: { required: false, mutable: true },
        phoneNumber: { required: false, mutable: true },
        fullname: { required: false, mutable: true },
      },
      customAttributes: {
        // App role travels in the JWT as "custom:role" (see shared/auth.ts getPrincipal).
        role: new cognito.StringAttribute({ mutable: true }),
      },
      passwordPolicy: { minLength: 8, requireLowercase: true, requireDigits: true, requireSymbols: false, requireUppercase: false },
      accountRecovery: cognito.AccountRecovery.EMAIL_AND_PHONE_WITHOUT_MFA,
      removalPolicy: cfg.removalPolicy,
      // TODO(owner): SMS sending needs an SNS role + spending limit + (in prod) a
      // dedicated origination number/short code. Configure SMS role & sandbox exit.
    });

    // DEV/STAGING ONLY: auto-confirm + auto-verify sign-ups so email/password test
    // users are usable instantly (no emailed code). Never enabled in prod.
    if (cfg.stage !== 'prod') {
      const preSignup = new lambda.Function(this, 'PreSignupAutoConfirm', {
        functionName: `sc-${cfg.stage}-pre-signup`,
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.ARM_64,
        handler: 'index.handler',
        timeout: Duration.seconds(5),
        code: lambda.Code.fromInline(
          'exports.handler = async (event) => {' +
            ' event.response.autoConfirmUser = true;' +
            ' if (event.request.userAttributes.email) event.response.autoVerifyEmail = true;' +
            ' if (event.request.userAttributes.phone_number) event.response.autoVerifyPhone = true;' +
            ' return event; };',
        ),
      });
      this.userPool.addTrigger(cognito.UserPoolOperation.PRE_SIGN_UP, preSignup);
    }

    // Google federation. Reads client id/secret from Secrets Manager if provided.
    // TODO(owner): create the Google OAuth client, store creds in Secrets Manager,
    // set cfg.googleOAuthSecretArn, and add the pool's callback URLs in Google console.
    if (cfg.googleOAuthSecretArn) {
      new cognito.UserPoolIdentityProviderGoogle(this, 'Google', {
        userPool: this.userPool,
        clientId: SecretValue.secretsManager(cfg.googleOAuthSecretArn, { jsonField: 'clientId' }).unsafeUnwrap(),
        clientSecretValue: SecretValue.secretsManager(cfg.googleOAuthSecretArn, { jsonField: 'clientSecret' }),
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          fullname: cognito.ProviderAttribute.GOOGLE_NAME,
        },
      });
    }

    const isProd = cfg.stage === 'prod';
    this.userPoolClient = this.userPool.addClient('WebClient', {
      userPoolClientName: `sc-${cfg.stage}-web`,
      generateSecret: false, // public SPA
      // USER_PASSWORD_AUTH is a dev/e2e convenience only. Prod uses SRP (password
      // never leaves the client) and the auth-code + PKCE flow.
      authFlows: { userSrp: true, userPassword: !isProd },
      // Don't reveal whether a username exists (blocks account enumeration).
      preventUserExistenceErrors: true,
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        ...(cfg.googleOAuthSecretArn ? [cognito.UserPoolClientIdentityProvider.GOOGLE] : []),
      ],
      oAuth: {
        // Implicit grant (token in the URL fragment) is a dev convenience for the
        // /live page. Prod uses ONLY authorization-code + PKCE (implicit is retired).
        flows: { authorizationCodeGrant: true, implicitCodeGrant: !isProd },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: cfg.corsOrigins.flatMap((o) => [`${o}/live`, `${o}/auth/callback`]),
        logoutUrls: cfg.corsOrigins,
      },
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.days(30),
    });

    // Hosted UI domain. Suffix with the account id to keep the prefix globally unique.
    const domainPrefix = `sc-${cfg.stage}-${this.account}`;
    this.userPool.addDomain('HostedUI', { cognitoDomain: { domainPrefix } });

    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
    new CfnOutput(this, 'Issuer', {
      value: `https://cognito-idp.${cfg.region}.amazonaws.com/${this.userPool.userPoolId}`,
    });
    new CfnOutput(this, 'HostedUiDomain', {
      value: `https://${domainPrefix}.auth.${cfg.region}.amazoncognito.com`,
    });
  }
}
