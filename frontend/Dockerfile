# Use the official PHP Apache image
FROM php:8.2-apache

# Set the working directory inside the container
WORKDIR /var/www/html

# Copy all frontend files (PHP, JS, HTML, CSS)
COPY . /var/www/html

# Enable Apache mod_rewrite (if needed)
RUN a2enmod rewrite

# Expose port 80
EXPOSE 80

# Start Apache server
CMD ["apache2-foreground"]
