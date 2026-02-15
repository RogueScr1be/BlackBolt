import { Module } from '@nestjs/common';
import { GbpClient } from './gbp.client';
import { EnvTokenVault } from './token-vault';

@Module({
  providers: [EnvTokenVault, GbpClient],
  exports: [EnvTokenVault, GbpClient]
})
export class GbpModule {}
