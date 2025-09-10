package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jaedonspurlock01/routify-updated/internal/handlers"
	"github.com/jaedonspurlock01/routify-updated/internal_config"
	"github.com/jaedonspurlock01/routify-updated/routes"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func main() {
	e := echo.New()

	e.Use(middleware.Logger())
	e.Use(middleware.Recover())

	internal_config.InitCORS(e)

	// Intialize API routes
	h := handlers.NewHandler()
	routes.InitRoutes(e, h)

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-quit
		log.Println("Shutting down server...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := e.Shutdown(ctx); err != nil {
			log.Fatalf("Error shutting down server: %v", err)
		}
	}()

	log.Println("Starting server on port 8080")
	if err := e.Start(":8080"); err != nil {
		log.Fatalf("Error starting server: %v", err)
	}
}
