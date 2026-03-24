import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type JwtUser = {
  sub: string;
  email: string;
  role: string;
};

export const CurrentUser = createParamDecorator((_, context: ExecutionContext): JwtUser | undefined => {
  const request = context.switchToHttp().getRequest();
  return request.user as JwtUser | undefined;
});
