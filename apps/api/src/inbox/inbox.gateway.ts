import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { NotificationsService } from "../notifications/notifications.service";

@WebSocketGateway({
  cors: { origin: "*" }
})
export class InboxGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly notificationsService: NotificationsService) {}

  afterInit() {
    this.notificationsService.bindGateway(this.server);
  }

  handleConnection(client: Socket) {
    const userId = String(client.handshake.query.userId ?? "");
    if (userId) {
      client.join(`user:${userId}`);
    }
  }

  @SubscribeMessage("join-conversation")
  handleJoin(@ConnectedSocket() client: Socket, @MessageBody("conversationId") conversationId: string) {
    client.join(`conversation:${conversationId}`);
  }
}
