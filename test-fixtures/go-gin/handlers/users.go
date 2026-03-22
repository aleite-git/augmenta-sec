package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// User represents a user entity.
type User struct {
	ID    string `json:"id" binding:"required"`
	Name  string `json:"name" binding:"required,min=1,max=255"`
	Email string `json:"email" binding:"required,email"`
	Role  string `json:"role" binding:"required,oneof=admin user viewer"`
}

// HealthCheck returns service health status.
func HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// ListUsers returns all users.
func ListUsers(c *gin.Context) {
	// Database query placeholder
	users := []User{}
	c.JSON(http.StatusOK, gin.H{"data": users, "total": len(users)})
}

// CreateUser creates a new user.
func CreateUser(c *gin.Context) {
	var user User
	if err := c.ShouldBindJSON(&user); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// Database insert placeholder
	c.JSON(http.StatusCreated, gin.H{"data": user})
}

// GetUser returns a user by ID.
func GetUser(c *gin.Context) {
	id := c.Param("id")
	// Database query placeholder
	c.JSON(http.StatusOK, gin.H{"data": User{ID: id, Name: "placeholder"}})
}

// DeleteUser deletes a user by ID.
func DeleteUser(c *gin.Context) {
	_ = c.Param("id")
	// Database delete placeholder
	c.Status(http.StatusNoContent)
}
