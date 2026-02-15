import { Body, Controller, NotImplementedException, Post } from '@nestjs/common';

@Controller('v1/auth')
export class AuthController {
  @Post('login')
  login(@Body() body: { email?: string; password?: string }) {
    throw new NotImplementedException({
      error: 'not_implemented',
      message: 'Auth login not implemented in Phase 1 skeleton',
      received: {
        emailProvided: Boolean(body?.email),
        passwordProvided: Boolean(body?.password)
      }
    });
  }
}
