"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, X, Send, MessageCircle, Sparkles } from "lucide-react";
import { apiClient, ChatResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
  citations?: string[];
}

export function FloatingChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>("");
  const [isMinimized, setIsMinimized] = useState(false);
  const { user, isAuthenticated } = useAuth();

  // Load chat history when opening
  useEffect(() => {
    if (isOpen && sessionId && isAuthenticated) {
      loadChatHistory();
    }
  }, [isOpen, sessionId, isAuthenticated]);

  const loadChatHistory = async () => {
    try {
      const history = await apiClient.getChatHistory(sessionId);
      const formattedMessages: Message[] = history.messages.map((msg, index) => ({
        id: `history-${index}`,
        content: msg.response,
        role: "assistant" as const,
        timestamp: new Date(msg.timestamp),
        citations: msg.source_ids || [],
      }));
      
      // Add user messages (simplified - in production would store user queries too)
      const allMessages: Message[] = [];
      history.messages.forEach((msg, index) => {
        allMessages.push({
          id: `user-${index}`,
          content: msg.query,
          role: "user" as const,
          timestamp: new Date(msg.timestamp),
        });
        allMessages.push(formattedMessages[index]);
      });
      
      setMessages(allMessages);
    } catch (error) {
      console.error("Failed to load chat history:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !isAuthenticated) {
      if (!isAuthenticated) {
        console.error("User not authenticated - cannot use AI chat");
        return;
      }
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: input.trim(),
      role: "user",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const queryText = input.trim();
    setInput("");
    setIsLoading(true);

    try {
      const response = await apiClient.sendChatMessage(queryText, sessionId || undefined);
      
      // Update session ID if this is the first message
      if (!sessionId) {
        setSessionId(response.session_id);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: response.response,
        role: "assistant",
        timestamp: new Date(),
        citations: response.sources ? response.sources.map(source => source.title) : [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Failed to send chat message:", error);
      
      let errorMessage = "Sorry, I encountered an error while processing your request. Please try again.";
      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch')) {
          errorMessage = "Unable to connect to the AI service. Please check your connection and try again.";
        } else if (error.message.includes('401') || error.message.includes('unauthorized')) {
          errorMessage = "You need to be logged in to use the AI chat feature.";
        } else if (error.message.includes('403') || error.message.includes('forbidden')) {
          errorMessage = "You don't have permission to use the AI chat feature.";
        }
      }
      
      const errorResponse: Message = {
        id: (Date.now() + 1).toString(),
        content: errorMessage,
        role: "assistant",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorResponse]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated) {
    return null; // Don't show chat widget for unauthenticated users
  }

  if (!isOpen) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          size="lg"
          className="rounded-full w-14 h-14 shadow-lg hover:shadow-xl transition-all duration-200 bg-primary hover:bg-primary/90"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
        
        {/* Notification badge for new features */}
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-2rem)]">
      <Card className="shadow-2xl border-0 bg-background/95 backdrop-blur-sm">
        {/* Header */}
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            CSEDU Assistant
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMinimized(!isMinimized)}
              className="h-8 w-8 p-0"
            >
              <span className="text-xs">{'_'}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        {!isMinimized && (
          <>
            <CardContent className="pt-0">
              {/* Messages */}
              <div className="h-96 overflow-y-auto space-y-3 mb-4 pr-2">
                {messages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <Bot className="h-8 w-8 mx-auto mb-2 text-primary" />
                    <p className="text-sm">Ask me anything about CSEDU resources!</p>
                    <div className="mt-3 flex flex-wrap gap-1 justify-center">
                      <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted">
                        Research papers
                      </Badge>
                      <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted">
                        Library books
                      </Badge>
                      <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted">
                        Student projects
                      </Badge>
                    </div>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-2 ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {message.role === "assistant" && (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0 mt-1">
                          <Bot className="h-3 w-3" />
                        </div>
                      )}
                      
                      <div
                        className={`max-w-[80%] rounded-lg p-2 ${
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        <p className="text-sm leading-relaxed">{message.content}</p>
                        
                        {message.citations && message.citations.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {message.citations.map((citation, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {citation}
                              </Badge>
                            ))}
                          </div>
                        )}
                        
                        <div className="mt-1 text-xs opacity-70">
                          {message.timestamp.toLocaleTimeString()}
                        </div>
                      </div>

                      {message.role === "user" && (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted shrink-0 mt-1">
                          <div className="h-3 w-3 rounded-full bg-foreground/50" />
                        </div>
                      )}
                    </div>
                  ))
                )}

                {isLoading && (
                  <div className="flex gap-2 justify-start">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0 mt-1">
                      <Bot className="h-3 w-3" />
                    </div>
                    <div className="max-w-[80%] rounded-lg p-2 bg-muted">
                      <Skeleton className="h-3 w-full mb-1" />
                      <Skeleton className="h-3 w-3/4" />
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <form onSubmit={handleSubmit} className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about CSEDU resources..."
                  className="min-h-[60px] resize-none text-sm"
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                />
                <Button 
                  type="submit" 
                  disabled={!input.trim() || isLoading} 
                  size="sm"
                  className="self-end"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
