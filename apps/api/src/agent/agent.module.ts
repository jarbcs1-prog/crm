import { Module } from "@nestjs/common";
import { AgentQueueService } from "./agent-queue.service";
import { AgentTriggerService } from "./agent-trigger.service";

@Module({
	providers: [AgentTriggerService, AgentQueueService],
	exports: [AgentTriggerService, AgentQueueService],
})
export class AgentModule {}
