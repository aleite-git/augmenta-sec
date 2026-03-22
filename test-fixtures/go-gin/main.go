package main

import (
	"log"
	"os"

	"github.com/acme/go-api/handlers"
	"github.com/acme/go-api/middleware"
	"github.com/gin-gonic/gin"
	"github.com/rs/cors"
)

func main() {
	r := gin.Default()

	// CORS
	corsConfig := cors.New(cors.Options{
		AllowedOrigins:   []string{getEnv("CORS_ORIGIN", "http://localhost:3000")},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	})
	_ = corsConfig // applied via middleware in production

	// Public routes
	r.GET("/health", handlers.HealthCheck)

	// Protected routes
	api := r.Group("/api")
	api.Use(middleware.AuthMiddleware())
	{
		api.GET("/users", handlers.ListUsers)
		api.POST("/users", handlers.CreateUser)
		api.GET("/users/:id", handlers.GetUser)
		api.DELETE("/users/:id", middleware.RequireRole("admin"), handlers.DeleteUser)
	}

	port := getEnv("PORT", "8080")
	log.Printf("Starting server on :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
